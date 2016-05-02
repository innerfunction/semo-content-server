#!/bin/bash
# usage: get-content.sh server username feed

SERVER="localhost"
PORT="8079"
APIVER="2.0"

FEED="jloriente-site"

# read from args
GITSERVER=$1
FEED=$2

URL="http://$SERVER:$PORT/?server=$GITSERVER&feed=$FEED&apiver=$APIVER"

echo -e "GET $URL \n"

curl -X GET $URL

echo -e "\n"


