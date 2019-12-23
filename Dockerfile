FROM node:10

RUN apt-get update
RUN apt-get install -y docker curl build-essential

RUN curl -L https://github.com/docker/machine/releases/download/v0.16.2/docker-machine-`uname -s`-`uname -m` >/tmp/docker-machine && \
chmod +x /tmp/docker-machine && \
cp /tmp/docker-machine /usr/local/bin/docker-machine

WORKDIR /usr/src/app

COPY . /usr/src/app/

RUN yarn install

EXPOSE 443

CMD ["yarn", "start"]
