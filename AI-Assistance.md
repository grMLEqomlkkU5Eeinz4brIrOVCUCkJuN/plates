This repository contains code that makes use of LLM generated code, and is something I would like to be transparent about.

The templates were extracted from some of my personal projects and I basically told the LLM to "strip away" content that is related to the project to the point that this can be an effective template.

Update: I got LLMs to help me migrate some stuff to use a schema first approach for openAPI generation, here is what i asked it to do, a good amount of work was done by hand
	- copy my work in base-backend-jwt to the rest of the express templates, and to account for differences unique to each template, should there be any conflict or notable changes, do report back
	- same prompt above, but copy from bevd-base-lacewing
	- convert some of the swagger comments to javascript
	- update configs
	- resolve notable csrf bug and difference in codebase
	- add sample REST routes to bun based projects