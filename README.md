# Semo Content Service

Node service to serve content from Git to mobile devices.

The service offers a REST API, the main features are:

* Add repositories: It clones in the server your Git repos to be delivered to mobile.
* Publish content: Packs and publish your content in zip.

# Setup

Create a settings.json configuration file for the service:

~~~ json
{
    "repoDir":      "repos",                   
    "packageDir":   "packages",             
    "zipBaseURL":   "http://localhost/",    
    "port":         8079
}
~~~

## Usage

To run the service just use the semocs command with a settings file.

~~~
$ semocs settings.json
~~~


## How it works

There are basically two operations:
* Cloning repositories
* Create and serving zip content files

### Cloning repositories

You can clone your projects in the filesystem to be used by the service using the /clone action:

  GET: /clone/ ?username={GitUsername}&password={GitPassword}}&feed={repoName}

The params you can use in the query are:

* username: Your Git username.
* password: Your Git password.
* feed: Your repository name.

The service uses the 'git clone' command with a url like https://username:password@github.com/username/feed.git.

The repos are stores in the local file system under /settings.repoDir/{username}/{feed}

Example: http://localhost:8079/clone/?username=tester&password=test&feed=semo-jekyll-demo

### Serving content:

Now you can access your repos content using:

  GET: / ?username={GitUsername}&feed={repoName}&apiver=2.0

The params you can use in the query are:

* username: Your Git username
* feed: Your repository name.
* apiver: The api version. Current 2.0.

That returns a json with the URL to download the zip file with all your repo content:

~~~ json
{
  feed: "semo-jekyll-demo",
  status: "current-content",
  current: "3439979",
  url: "http://localhost/semo-jekyll-demo/3439979/content.zip"
}
~~~

Example: http://localhost:8079/?username=testuser&feed=semo-jekyll-demo&apiver=2.0





----
http://localhost:8079/clone/?username=jloriente&password=anu2Taiwe&feed=jloriente-site

TODO:
* The service clone the project from GitHub. We could also host our Git server.
