#!/bin/bash

rm -rf content.*

COMMIT="$(git log --pretty=format:%h -n 1 2>&1)"
echo -e "COMMIT: $COMMIT \n"

# used to zip files
# echo -e "ARCHIVE: $COMMIT \n"
# git archive -o content.zip -v $COMMIT

# used to see all files in current commit
# echo -e "\nSHOW: $COMMIT\n"
# git show --pretty=format: --name-only $COMMIT

# git diff --name-status {ref} {current}

# git show --pretty=format: --name-only {commit}

# git ls-tree -r --name-status {commit}:{folder}



