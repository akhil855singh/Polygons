# Use Node.js official image as base image
FROM node:18

# Set working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if exists)
COPY package*.json ./

# Install dependencies including devDependencies
# This will install both regular and dev dependencies
RUN npm install

RUN npm i nodemon -g
#RUN npm i compression -g

# Copy the rest of the application files
COPY . .

# Expose the port the app runs on
EXPOSE 6010

# Start the server using nodemon
CMD ["npm", "start"]
