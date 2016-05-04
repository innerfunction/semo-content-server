#!/bin/bash

USERNAME=$1
PASS=$2

# Clone a repo (GitHub) 
#./script/clone-github.sh $USERNAME $PASS jloriente/0x1f
./script/clone-github.sh $USERNAME $PASS innerfunction/semo-jekyll-demo

# Clone a repo (Git)
#./script/clone.sh git.innerfunction.com $USERNAME $PASS julian/thebuildingregulations.com
#./script/clone.sh git.innerfunction.com $USERNAME $PASS jloriente/semo-jekyll-demo

