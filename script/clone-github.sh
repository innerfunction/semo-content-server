#!/bin/bash

# Usage "clone-github USER PASS REPONAME"

# GET http://localhost:8079/clone/?username=jloriente&password=anu2Taiwe&feed=jloriente-site'

SERVER="localhost"
PORT="8079"

FEED="jloriente-site"
USERNAME="jloriente" #git username
PASSWORD="**"

# read from args
USERNAME=$1
PASSWORD=$2
FEED=$3

URL="http://$SERVER:$PORT/clone/?username=$USERNAME&password=$PASSWORD&feed=$FEED"

echo "GET $URL"

curl -X GET $URL

# JSON PARAMS
#curl -i -H "Accept: application/json" "s$SERVER:5050/a/c/getName{"param0":"pradeep"}" 

