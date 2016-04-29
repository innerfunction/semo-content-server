# Semo Content Service

Node service create and serve content zip files from Jekyll sites in GitHub to mobile devices.

The service offers a REST API to feed content and manage Git repositories.  Main usages:

* Clone projects from Git repositories
* Pack and publish zip content files to be delivered to mobile apps.

# Setup

Create a settings.json configuration file for the service:

~~~ json
{
    "repoDir":      "..",                   // path to your repos directory
    "packageDir":   "packages",             // the output package
    "zipBaseURL":   "http://localhost/",    s
    "port":         8079
}
~~~

## Usage

Run the service with the semocs command passing a settings json file.

~~~
$ semocs settings.json
~~~

Now you can access your repos content using:

  GET: http://localhost:8079/?feed=semo-jekyll-demo/&apiver=2.0

That returns a URL to download the zip file.

~~~ json
{
  feed: "semo-jekyll-demo",
  status: "current-content",
  current: "3439979",
  url: "http://localhost/semo-jekyll-demo/3439979/content.zip"
}
~~~

## How it works

There are basically two operations:
* Cloning repositories
* Create and serving zip content files

### Cloning repositories

You can clone your projects in the filesystem to be used by the service using the /clone action:

  GET: /clone/?username=tester&password=test&feed="semo-jekyll-demo"

The project https://username:password@github.com/username/{feed}.git will be cloned in {repoDir}/{username}/{feed} in the local system.

Examples: http://localhost:8079/clone/?username=tester&password=test&feed=semo-jekyll-demo
Examples: http://localhost:8079/clone/?username=jloriente&password=anu2Taiwe&feed=jloriente-site

TODO:
* The service clone the project from GitHub. We could also host our Git server.
