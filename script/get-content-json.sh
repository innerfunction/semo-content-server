#!/bin/bash
# usage: get-content.sh username feed

SERVER="localhost"
PORT="8079"
APIVER="2.0"

FEED="jloriente-site"
USERNAME="jloriente" #git username

# read from args
USERNAME=$1
FEED=$2

URL="http://$SERVER:$PORT/?username=$USERNAME&feed=$FEED&apiver=$APIVER"

echo "GET $URL"

curl -X GET $URL


