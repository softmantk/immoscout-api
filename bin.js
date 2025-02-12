var Immoscout = require('./');

var is = Immoscout({
  consumerKey: process.env['OAUTH_CONSUMER_KEY'],
  consumerSecret: process.env['OAUTH_CONSUMER_SECRET'],
  token: process.env['OAUTH_TOKEN'],
  secret: process.env['OAUTH_SECRET']
});

is[process.argv[2]].apply(is, process.argv.slice(3)).then(console.log, console.log)
