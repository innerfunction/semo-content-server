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
GITPORT=$2
USERNAME=$3
PASSWORD=$4
FEED=$5

URL="http://$SERVER:$PORT/clone/?server=$GITSERVER&port=$GITPORT&username=$USERNAME&password=$PASSWORD&feed=$FEED"

echo -e "CLONE: $URL\n"

curl -X GET $URL

echo -e "\n"

# JSON PARAMS
#curl -i -H "Accept: application/json" "s$SERVER:5050/a/c/getName{"param0":"pradeep"}" 

