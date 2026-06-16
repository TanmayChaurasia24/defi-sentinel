FROM node:18-alpine

RUN apk add --no-cache openssl
# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

# Bundle app source
COPY . .

# Generate Prisma Client & Build TypeScript
RUN npx prisma generate
RUN npm run build

# Expose API port
EXPOSE 4000

# Start agent
CMD ["npm", "start"]
