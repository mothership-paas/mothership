# Manual Setup

## Prerequisites

* [Docker](https://docker.com/)
* [docker-machine](https://docs.docker.com/v17.09/machine/install-machine/)
* DigitalOcean account (or other IaaS)
* Domain for use with Mothership

---

## 1. Create a server for Mothership using docker-machine

```
docker-machine create --driver digitalocean --digitalocean-access-token YOUR_DO_ACCESS_TOKEN mothership-paas
```

_(command may differ for another IaaS provider, refer to docker-machine docs for more info)_

## 2. SSH into 'mothership-paas'

```
docker-machine ssh mothership-paas
```

## 3. Install docker-compose and docker-machine

```
sudo curl -L "https://github.com/docker/compose/releases/download/1.25.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

```
base=https://github.com/docker/machine/releases/download/v0.16.2 &&
curl -L $base/docker-machine-$(uname -s)-$(uname -m) >/tmp/docker-machine &&
sudo mv /tmp/docker-machine /usr/local/bin/docker-machine &&
chmod +x /usr/local/bin/docker-machine
```

## 4. Create server for Mothership Swarm Manager

**While still SSHed into the Mothership Server** issue the following command

```
docker-machine create --driver digitalocean --digitalocean-access-token YOUR_DO_ACCESS_TOKEN mothership-swarm
```

## 5. Set up Docker Swarm

```
docker-machine ip mothership-swarm
```

Take note of this IP address.

```
eval $(docker-machine env mothership-swarm)
```

```
docker swarm init --advertise-addr YOUR_MOTHERSHIP_SWARM_IP
```
(`YOUR_MOTHERSHIP_SWARM_IP` should be the IP address from the `docker-machine ip` command)

```
docker network create --driver overlay proxy
```
```
docker service create --name swarm-listener \
--network proxy \
--mount "type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock" \
-e DF_NOTIFY_CREATE_SERVICE_URL=http://proxy:8080/v1/docker-flow-proxy/reconfigure \
-e DF_NOTIFY_REMOVE_SERVICE_URL=http://proxy:8080/v1/docker-flow-proxy/remove \
--constraint 'node.role==manager' \
dockerflow/docker-flow-swarm-listener
```
```
docker service create --name proxy \
-p 80:80 \
-p 443:443 \
--network proxy \
-e LISTENER_ADDRESS=swarm-listener \
dockerflow/docker-flow-proxy
```
```
eval $(docker-machine env -u)
```

## 6. DNS Setup

Get the IP address of the **Mothership server**

```
dig +short myip.opendns.com @resolver1.opendns.com
```

(Node the result of this command)

Get the IP address of the **Mothership swarm manager**

```
docker-machine ip mothership-swarm
```
(Note the result of this command)

You'll now need to add a couple of resource records to your DNS provider:

| Name | Type | Value |
|------|------|-------|
| @ | A | _Mothership swarm manager ip_ |
| * | A | _Mothership swarm manager ip_ |
| mothership | A | _Mothership server ip_ |

(Don't move forward in the tutorial until you've done this.)

## 7. SSL

Install [Certbot](https://certbot.eff.org/instructions) (If you used `docker-machine` to create the server, use the [instructions for Ubuntu](https://certbot.eff.org/lets-encrypt/ubuntuxenial-other))

For this walkthrough, we'll use Certbot in standalone mode.

**When asked what domain you'd like to get the cert for answer in the format `mothership.YOUR_DOMAIN`**. (e.g. if you'd like to deploy Mothership on `example.com` you'd answer with `mothership.example.com`)

```
sudo certbot certonly --standalone
```

Follow the prompts for the command. Once Certbot finishes, take note of the location of the cert, key, and chain. They should look something like this:

```
/etc/letsencrypt/live/mothership.YOUR_DOMAIN/privkey.pem
/etc/letsencrypt/live/mothership.YOUR_DOMAIN/cert.pem
/etc/letsencrypt/live/mothership.YOUR_DOMAIN/chain.pem
```

The paths for these files will be needed when starting Mothership for the first time.

## 8. Create Docker Compose file

Create a `docker-compose.yml` file on the Mothership server with the following content.

* For `MOTHERSHIP_DOMAIN` fill in your domain **without** any subdomains (`example.com`).
* For `MOTHERSHIP_MANAGER_IP` fill in the IP address of the Mothership Swarm Manager (`docker-machine ip mothership-swarm`).
* For `SSL_KEY_PATH`, `SSL_CERT_PATH`, and `SSL_CA_PATH` add the paths for the files from **Step 7**.
  * (It's likely you only need to replace the `YOUR_DOMAIN` bit if you used Certbot)

```yml
version: '3'

services:
  web:
    image: mothershippaas/mothership:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /root/.docker:/root/.docker
      - /etc/letsencrypt:/etc/letsencrypt
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=foobarbaz
      - REDIS_HOST=redis
      - DB_USERNAME=postgres
      - DB_NAME=paas_development
      - DB_HOST=database
      - DB_PASSWORD=password
      - MOTHERSHIP_DOMAIN=
      - MOTHERSHIP_MANAGER_NAME=mothership-swarm
      - MOTHERSHIP_MANAGER_IP=
      - PORT=443
      - SSL=true
      - SSL_KEY_PATH=/etc/letsencrypt/live/mothership.YOUR_DOMAIN/privkey.pem
      - SSL_CERT_PATH=/etc/letsencrypt/live/mothership.YOUR_DOMAIN/cert.pem
      - SSL_CA_PATH=/etc/letsencrypt/live/mothership.YOUR_DOMAIN/chain.pem
    ports:
      - "443:443"
      - "80:80"

  database:
    image: postgres
    environment:
      - POSTGRES_DB=paas_development
      - POSTGRES_PASSWORD=password
    volumes:
      - db_data:/var/lib/postgresql/data

  redis:
    image: redis

volumes:
  db_data:
```

## 9. Start Mothership server

After creating and fill the `docker-compose.yml` file with your appropriate values, start the server:

```
docker-compose up -d
```

Next, migrate and seed the database:

```
docker-compose run web ./node_modules/.bin/sequelize db:migrate
docker-compose run web ./node_modules/.bin/sequelize db:seed:all
```

## 10. Change Admin password

* Your Mothership should now be live and ready to use!
* You should log in to your Mothership and change the default admin username/password:

```
username: admin@mothership.live
password: m0th3rsh1p
```

* **Be sure to log in and change the username + password!**
* **Do NOT lose access to this account!**
