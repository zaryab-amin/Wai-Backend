FROM public.ecr.aws/docker/library/node:20.0.0-slim

# Install curl for ECS healthchecks
RUN apt-get update && apt-get install curl -y


# Setting up the work directory
WORKDIR /backend
RUN chown -R node /backend

EXPOSE 8080

COPY package.json ./
RUN npm install 
COPY . .


EXPOSE 8080

USER node

CMD ["npm","run", "docker"]
