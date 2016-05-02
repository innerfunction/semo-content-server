#!/bin/bash

rm -rf content.*

COMMIT="$(git log --pretty=format:%h -n 1 2>&1)"
echo -e "COMMIT: $COMMIT \n"


echo -e "ARCHIVE: $COMMIT \n"
git archive -o content.zip -v $COMMIT

echo -e "\nSHOW: $COMMIT\n"
git show --pretty=format: --name-only $COMMIT
