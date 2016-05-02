#!/bin/bash

# Usage "clone-github GITUSER PASS FEED"

# GET http://localhost:8079/clone/?username=jloriente&password=anu2Taiwe&feed=jloriente-site'

# The local service 
SERVER="localhost"
PORT="8079"

# read from args
USERNAME=$1
PASSWORD=$2
FEED=$3

URL="http://$SERVER:$PORT/clone/?username=$USERNAME&password=$PASSWORD&feed=$FEED"

echo -e "CLONE (GITHUB): $URL\n"

curl -X GET $URL

echo -e "\n"

# JSON PARAMS
#curl -i -H "Accept: application/json" "s$SERVER:5050/a/c/getName{"param0":"pradeep"}" 

