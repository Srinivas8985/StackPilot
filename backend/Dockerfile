FROM node:20-alpine

# Install git since the backend executes 'git clone' to analyze and build repos
RUN apk add --no-cache git

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --only=production

COPY . .

EXPOSE 5000

CMD ["npm", "start"]
