package com.example.simplebackend.exception;

import com.example.simplebackend.filter.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.validation.method.ParameterValidationResult;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestValueException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import tools.jackson.databind.exc.UnrecognizedPropertyException;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The one place a failure becomes a response. Every body is an RFC 9457 problem
 * carrying a stable {@code code} and the request id; nothing else about the
 * failure reaches the caller.
 */
@RestControllerAdvice
class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);
    private static final int MAX_CAUSE_DEPTH = 16;

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ProblemDetail> handleApi(ApiException exception, HttpServletRequest request) {
        log.debug("{} on {} {}: {}", exception.code(), request.getMethod(), request.getRequestURI(),
                exception.getMessage());
        return ResponseEntity.status(exception.code().status())
                .body(problem(exception.code(), exception.getMessage(), request, Map.of()));
    }

    /**
     * Anything not deliberately mapped above. The caller gets a code and a request
     * id, the log gets the cause, and the two are joined by that id.
     */
    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> handleUnexpected(Exception exception, HttpServletRequest request) {
        log.error("unhandled failure on {} {}", request.getMethod(), request.getRequestURI(), exception);
        return ResponseEntity.status(ErrorCode.INTERNAL_ERROR.status())
                .body(problem(ErrorCode.INTERNAL_ERROR, "The request could not be completed", request, Map.of()));
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception exception, Object body, HttpHeaders headers,
                                                             HttpStatusCode status, WebRequest request) {

        ErrorCode code = classify(exception, status);
        if (code.status().is5xxServerError()) {
            log.error("framework failure on {}", request.getDescription(false), exception);
        } else {
            log.debug("{} on {}: {}", code, request.getDescription(false), exception.getMessage());
        }

        HttpServletRequest servletRequest =
                request.resolveReference(WebRequest.REFERENCE_REQUEST) instanceof HttpServletRequest resolved
                        ? resolved
                        : null;
        ProblemDetail problem = problem(code, detailFor(code, exception), servletRequest, fieldErrors(exception));
        return new ResponseEntity<>(problem, headers, code.status());
    }

    private static ErrorCode classify(Exception exception, HttpStatusCode status) {
        return switch (exception) {
            case MethodArgumentNotValidException ignored -> ErrorCode.VALIDATION_FAILED;
            case HandlerMethodValidationException ignored -> ErrorCode.VALIDATION_FAILED;
            case MissingRequestValueException ignored -> ErrorCode.VALIDATION_FAILED;
            case TypeMismatchException ignored -> ErrorCode.VALIDATION_FAILED;
            case HttpRequestMethodNotSupportedException ignored -> ErrorCode.METHOD_NOT_ALLOWED;
            case HttpMediaTypeNotSupportedException ignored -> ErrorCode.UNSUPPORTED_MEDIA_TYPE;
            case NoResourceFoundException ignored -> ErrorCode.NOT_FOUND;
            case HttpMessageNotReadableException unreadable -> {
                if (causeOf(unreadable, BodyTooLargeException.class) != null) {
                    yield ErrorCode.PAYLOAD_TOO_LARGE;
                }
                yield unknownProperty(unreadable) != null ? ErrorCode.VALIDATION_FAILED : ErrorCode.MALFORMED_REQUEST;
            }
            default -> ErrorCode.forStatus(status);
        };
    }

    /**
     * Messages from the framework quote the payload back: a parse failure repeats
     * the offending bytes and a type mismatch repeats the value. Only the fixed
     * wording chosen here leaves this service.
     */
    private static String detailFor(ErrorCode code, Exception exception) {
        return switch (code) {
            case VALIDATION_FAILED -> unknownProperty(exception) != null
                    ? "The request body has a field this endpoint does not accept"
                    : "The request is not valid";
            case MALFORMED_REQUEST -> "The request body could not be parsed";
            case NOT_FOUND -> "No handler for this path";
            case METHOD_NOT_ALLOWED -> "This method is not supported on this path";
            case UNSUPPORTED_MEDIA_TYPE -> "Send application/json";
            case PAYLOAD_TOO_LARGE -> {
                BodyTooLargeException tooLarge = causeOf(exception, BodyTooLargeException.class);
                yield "Request body exceeds the %d byte limit".formatted(tooLarge != null ? tooLarge.limitBytes() : 0);
            }
            default -> "The request could not be completed";
        };
    }

    /**
     * Bean validation messages describe the constraint, never the value that broke
     * it, so they are safe to hand back. The field names came from the caller.
     */
    private static Map<String, String> fieldErrors(Exception exception) {
        Map<String, String> errors = new LinkedHashMap<>();
        switch (exception) {
            case MethodArgumentNotValidException invalid -> {
                for (FieldError error : invalid.getBindingResult().getFieldErrors()) {
                    // First failure per field, not whichever one the iterator ends on.
                    errors.putIfAbsent(error.getField(), error.getDefaultMessage());
                }
            }
            case HandlerMethodValidationException invalid -> {
                for (ParameterValidationResult result : invalid.getParameterValidationResults()) {
                    String parameter = result.getMethodParameter().getParameterName();
                    result.getResolvableErrors().stream().findFirst().ifPresent(error ->
                            errors.putIfAbsent(parameter != null ? parameter : "request", error.getDefaultMessage()));
                }
            }
            case HttpMessageNotReadableException unreadable -> {
                String property = unknownProperty(unreadable);
                if (property != null) {
                    errors.put(property, "is not a field of this request");
                }
            }
            default -> {
            }
        }
        return errors;
    }

    /** The field a caller sent that no request record declares, or null. */
    private static String unknownProperty(Throwable throwable) {
        UnrecognizedPropertyException unrecognized = causeOf(throwable, UnrecognizedPropertyException.class);
        return unrecognized != null ? unrecognized.getPropertyName() : null;
    }

    /**
     * Walks a bounded number of causes. Spring wraps these three or four deep, and
     * a bound means a chain that loops back on itself cannot hang the handler.
     */
    private static <T extends Throwable> T causeOf(Throwable throwable, Class<T> type) {
        Throwable cause = throwable;
        for (int depth = 0; cause != null && depth < MAX_CAUSE_DEPTH; depth++, cause = cause.getCause()) {
            if (type.isInstance(cause)) {
                return type.cast(cause);
            }
        }
        return null;
    }

    private static ProblemDetail problem(ErrorCode code, String detail, HttpServletRequest request,
                                         Map<String, String> fieldErrors) {
        ProblemDetail problem = code.problem(detail);
        if (request != null) {
            problem.setInstance(URI.create(request.getRequestURI()));
            problem.setProperty("requestId", RequestIdFilter.of(request));
        }
        if (!fieldErrors.isEmpty()) {
            problem.setProperty("errors", fieldErrors);
        }
        return problem;
    }
}
