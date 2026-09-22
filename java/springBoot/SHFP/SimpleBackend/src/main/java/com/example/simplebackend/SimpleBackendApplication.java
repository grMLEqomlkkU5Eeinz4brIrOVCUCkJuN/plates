package com.example.simplebackend;

import com.example.simplebackend.config.StartupConfigCheck;
import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@OpenAPIDefinition(info = @Info(title = "SimpleBackend", version = "v1"))
@SpringBootApplication
public class SimpleBackendApplication {

    public static void main(String[] args) {
        SpringApplication application = new SpringApplication(SimpleBackendApplication.class);
        application.addListeners(new StartupConfigCheck());
        application.run(args);
    }
}
