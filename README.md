![Mothership](https://imgur.com/6InUcxa.png)

## Setup

* Clone repo
* Run `yarn install`
* Intall Docker on your system (if not already installed)

## Setup environment variables

	* `ACCESS_TOKEN=your-digitalocean-api-key`
	* `DB_USERNAME=username-on-your-computer`
	* `DB_NAME=paas_development`
	* `DB_HOST=127.0.0.1`

## Create and migrate database

* Run `sequelize db:create`
* Run `sequelize db:migrate`

## Create a manager node

* Create a manager node on digital ocean, via the command

```shell
$ docker-machine create --driver digitalocean --digitalocean-access-token your-digitalocean-api-key manager-node-name

$ docker-machine ls
```

Get IP address and insert that value in `Nodes` Table, with `MANAGER` value set to `true`

## Add DockerFlow Proxy information to the `Configs` table

* One with a key of `domain`, and value of root tld domain you'd like to use
* Another with key `proxyNetwork` and value `proxy`

You'll need to make sure that the root domain you pick is pointed at your manager, and that there is also a wildcard entry with that root domain pointing at your manager. 

You can do this via the DNS settings of a domain registrar, or via the vhosts file on your computer.

A record: * ; do-manager-node
A record; @ ; do-manager-node

## SSH into your manager node via docker-machine to initiate Docker Swarm and Dockerflow Proxy

* Initiate docker-swarm with `$ docker swarm init --advertise-addr your-node-ip-address`
* Initiate a proxy-network for manager node to use: `docker network create --driver overlay proxy`
* Create docker-flow proxy services

```shell
$ docker service create --name swarm-listener \
    --network proxy \
    --mount "type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock" \
    -e DF_NOTIFY_CREATE_SERVICE_URL=http://proxy:8080/v1/docker-flow-proxy/reconfigure \
    -e DF_NOTIFY_REMOVE_SERVICE_URL=http://proxy:8080/v1/docker-flow-proxy/remove \
    --constraint 'node.role==manager' \
    dockerflow/docker-flow-swarm-listener

$ docker service create --name proxy \
    -p 80:80 \
    -p 443:443 \
    --network proxy \
    -e LISTENER_ADDRESS=swarm-listener \
    dockerflow/docker-flow-proxy
```

## Start development server
Run `yarn start:dev` to access the product at `localhost:3000`.
