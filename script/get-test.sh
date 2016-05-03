#!/bin/bash

# get current
./script/get.sh github.com innerfunction/semo-jekyll-demo 
# get since
./script/get.sh github.com innerfunction/semo-jekyll-demo 0c4b78f
# test with a commit without an output-json
./script/get.sh github.com innerfunction/semo-jekyll-demo 9409ad9
