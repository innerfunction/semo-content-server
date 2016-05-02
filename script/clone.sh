#!/bin/bash

# Usage "clone GITSERVER USER PASS REPONAME"

# GET http://localhost:8079/clone/?username=jloriente&password=anu2Taiwe&feed=jloriente-site'

# The local service 
SERVER="localhost"
PORT=8079

# read from args
GITSERVER=$1
USERNAME=$2
PASSWORD=$3
FEED=$4

URL="http://$SERVER:$PORT/clone/?server=$GITSERVER&username=$USERNAME&password=$PASSWORD&feed=$FEED"

echo -e "CLONE (GIT): $URL\n"

curl -X GET $URL

echo -e "\n"

# JSON PARAMS
#curl -i -H "Accept: application/json" "s$SERVER:5050/a/c/getName{"param0":"pradeep"}" 

