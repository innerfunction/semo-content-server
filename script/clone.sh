#!/bin/bash

# Usage "clone-github GITSERVER USER PASS REPONAME"

# GET http://localhost:8079/clone/?username=jloriente&password=anu2Taiwe&feed=jloriente-site'

# The local service 
SERVER="localhost"
PORT="8079"

GITSERVER="github.com"
FEED="jloriente-site"
USERNAME="jloriente" #git username
PASSWORD="**"

# read from args
GITSERVER=$1
USERNAME=$2
PASSWORD=$3
FEED=$4

URL="http://$SERVER:$PORT/clone/?server=$GITSERVER&username=$USERNAME&password=$PASSWORD&feed=$FEED"

echo "GET $URL"

curl -X GET $URL

# JSON PARAMS
#curl -i -H "Accept: application/json" "s$SERVER:5050/a/c/getName{"param0":"pradeep"}" 

