# Stage 1: Build stage
FROM node:20-alpine as build

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install

COPY . .
RUN yarn build

# Stage 2: Production stage
FROM nginx:1.27-alpine as prod

# nginx:alpine ships with the `nginx` user (uid 101); chown the html dir, then drop privs.
COPY --from=build --chown=nginx:nginx /app/build /usr/share/nginx/html

USER nginx

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]