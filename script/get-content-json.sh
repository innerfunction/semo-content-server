#!/bin/bash
# usage: get-content.sh server username feed

SERVER="localhost"
PORT="8079"
APIVER="2.0"

FEED="jloriente-site"
USERNAME="jloriente" #git username

# read from args
GITSERVER=$1
USERNAME=$2
FEED=$3

URL="http://$SERVER:$PORT/?server=$GITSERVER&username=$USERNAME&feed=$FEED&apiver=$APIVER"

echo "GET $URL"

curl -X GET $URL


