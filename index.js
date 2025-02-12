var oauth = require('oauth');
var request = require('superagent');
var _ = require('underscore');
var join = require('url-join');
var checksum = require('checksum');
var q = require('q');

// Monkey patch superagent-oauth
require('adamvr-superagent-oauth')(request);

// Immoscout base
var sandbox = 'http://rest.sandbox-immobilienscout24.de/';
var base = 'https://rest.immobilienscout24.de/';

// Resolve path to immoscout
var resolve = function () {
  var args = _.toArray(arguments);

  // Push base onto arguments
  args.unshift(base);

  return join(args);
};

var Immoscout = module.exports = function Immoscout (opts) {
  if (!(this instanceof Immoscout)) return new Immoscout(opts);

  // Save opts
  this.opts = opts || {};

  // Load important parts
  if (!(opts.consumerKey && opts.consumerSecret && opts.token && opts.secret)) {
    throw new Error('Missing arguments to immmoscout');
  }

  // Sandbox mode
  this.base = opts.sandbox ? sandbox : base;

  // Setup oauth from opts
  this.oa = new oauth.OAuth(
    resolve('/restapi/security/oauth/request_token'),
    resolve('/restapi/security/oauth/access_token'),
    opts.consumerKey,
    opts.consumerSecret,
    '1.0',
    null,
    'HMAC-SHA1'
  );
};

Immoscout.prototype.findOne = function (id, opts) {
  var deferred = q.defer();

  var r = request
    .get(join(this.base, '/restapi/api/offer/v1.0/user/me/realestate', id))
    .sign(this.oa, this.opts.token, this.opts.secret)
    .accept('json')
    .end(function (err, res) {
      if (err) return deferred.reject(err);
      if (!res.ok) return deferred.reject(res.body);
      return deferred.resolve(Object.values(res.body)[0]);
    });

  return deferred.promise;
};

Immoscout.prototype.findContacts = function () {
  var deferred = q.defer();

  var r = request
    .get(join(this.base, '/restapi/api/offer/v1.0/user/me/contact/'))
    .sign(this.oa, this.opts.token, this.opts.secret)
    .accept('json')
    .end(function (err, res) {
      if (err) return deferred.reject(err);
      if (!res.ok) return deferred.reject(res.text);
      return deferred.resolve(res.body['common.realtorContactDetailsList']);
    });

  return deferred.promise;
};

var o2a = function (o) {
  return _.isArray(o) ? o : [o];
};

Immoscout.prototype.findAllAttachments = function (id) {
  var deferred = q.defer();

  var r = request
    .get(join(this.base, '/restapi/api/offer/v1.0/user/me/realestate', id, 'attachment'))
    .sign(this.oa, this.opts.token, this.opts.secret)
    .accept('json')
    .end(function (err, res) {
      if (err) return deferred.reject(err);
      if (!res.ok) return deferred.reject(res.text);
      return deferred.resolve(res.body['common.attachments'].length ? o2a(res.body['common.attachments'][0]['attachment']) : []);
    });

  return deferred.promise;
};

var typeMap = {
  'image': 'common:Picture',
  'url': 'common:Link'
};

Immoscout.prototype.createAttachment = function (id, buffer, info) {
  var deferred = q.defer();

  // Grab type
  var type = info.type;

  // Choke now if type not supported
  if (!typeMap[type]) return deferred.reject(new Error('Invalid attachment type')), deferred.promise;

  // Build boilerplate
  var boiler = {
    'common.attachment': {
      '@xmlns': {
        'common':'http://rest.immobilienscout24.de/schema/common/1.0'
      },
      '@xsi.type': typeMap[type],
      title: info.title,
      externalId: info.id,
    }
  };

  // Easy access
  var header = boiler['common.attachment'];

  if (type === 'image') {
    _.extend(header, {
      floorplan: info.floorplan || false,
      titlePicture: info.titlePicture || false,
      externalCheckSum: checksum(buffer)
    })
  } else {
    _.extend(header, {
      url: info.url
    })
  }

  // Setup request
  var req = request
    .post(join(this.base, '/restapi/api/offer/v1.0/user/me/realestate', id, 'attachment/'))
    .sign(this.oa, this.opts.token, this.opts.secret, {ignoreBody: 1})
    .accept('json')

  if (buffer) {
    // Send data as metadata and attachment
    req
      .attach('metadata', new Buffer(JSON.stringify(boiler)), 'body.json')
      .attach('attachment', buffer, info.path || info.title);
  } else {
    // Send data as request body
    req
      .type('json')
      .send(boiler);
  }

  // Run it
  req.end(function (err, res) {
    if (err) return deferred.reject(err);
    if (!res.ok) return deferred.reject(res.text);
    return deferred.resolve(res.body);
  });

  return deferred.promise;
};

Immoscout.prototype.deleteAttachment = function (id, attachmentId) {
  var deferred = q.defer();

  var r = request
    .del(join(this.base, '/restapi/api/offer/v1.0/user/me/realestate', id, 'attachment', attachmentId))
    .sign(this.oa, this.opts.token, this.opts.secret)
    .accept('json')
    .end(function (err, res) {
      if (err) return deferred.reject(err);
      if (!res.ok) return deferred.reject(res.text);
      return deferred.resolve(res.body);
    });

  return deferred.promise;
};

Immoscout.prototype.findAll = function (opts) {
  var deferred = q.defer();

  // Grab query parameters if applicable
  opts = opts || {}

  request
    .get(join(this.base, '/restapi/api/offer/v1.0/user/me/realestate'))
    .sign(this.oa, this.opts.token, this.opts.secret)
    .query({features: 'withattachments'})
    .query({pagesize: opts.perPage || 20})
    .query({pagenumber: opts.page || 1 })
    .accept('json')
    .end(function (err, res) {
      if (!res.ok) return deferred.reject(res.body);
      return deferred.resolve(useful(res.body));
    });

  return deferred.promise;
};

Immoscout.prototype.delete = function (id) {
  var deferred = q.defer();

  request
    .del(join(this.base, '/restapi/api/offer/v1.0/user/me/realestate/', id))
    .sign(this.oa, this.opts.token, this.opts.secret)
    .accept('json')
    .end(function (err, res) {
      if (!res.ok) return deferred.reject(res.body);
      return deferred.resolve(res.body);
    });

  return deferred.promise;
};

// Expects an xml string
Immoscout.prototype.create = function (content) {
  var deferred = q.defer();

  request
    .post(join(this.base, '/restapi/api/offer/v1.0/user/me/realestate'))
    .sign(this.oa, this.opts.token, this.opts.secret, {ignoreBody: true})
    .type('json')
    .accept('json')
    .send(content)
    .end(function (err, res) {
      if (err) return deferred.reject(err);
      if (!res.ok) return deferred.reject(res.text);
      return deferred.resolve(res.body);
    })

  return deferred.promise;
};

Immoscout.prototype.update = function (id, content) {
  var deferred = q.defer();

  request
    .put(join(this.base, '/restapi/api/offer/v1.0/user/me/realestate/', id))
    .sign(this.oa, this.opts.token, this.opts.secret, {ignoreBody: true})
    .type('json')
    .send(content)
    .end(function (err, res) {
      if (err) return deferred.reject(err);
      if (!res.ok) return deferred.reject(res.text);
      return deferred.resolve(true);
    })

  return deferred.promise;
};

Immoscout.prototype.publishChannels = function () {
  var deferred = q.defer();

  request
    .get(join(this.base, '/restapi/api/offer/v1.0/user/me/publishchannel'))
    .sign(this.oa, this.opts.token, this.opts.secret, {ignoreBody: true})
    .accept('json')
    .end(function (err, res) {
      if (err) return deferred.reject(err);
      if (!res.ok) return deferred.reject(res.text);
      return deferred.resolve(res.body);
    })

  return deferred.promise;
};

Immoscout.prototype.publish = function (id, channel) {
  var deferred = q.defer();

  request
    .post(join(this.base, '/restapi/api/offer/v1.0/publish'))
    .sign(this.oa, this.opts.token, this.opts.secret, {ignoreBody: true})
    .type('json')
    .send({
      'common.publishObject': {
        realEstate: {
          '@id': id,
        },
        publishChannel: {
          '@id': channel
        }
      }
    })
    .end(function (err, res) {
      if (err) return deferred.reject(err);
      if (!res.ok) return deferred.reject(res.text);
      return deferred.resolve(true);
    })

  return deferred.promise;
};

Immoscout.prototype.unpublish = function (id, channel) {
  var deferred = q.defer();

  request
    .del(join(this.base, '/restapi/api/offer/v1.0/publish', [id, channel].join('_')))
    .sign(this.oa, this.opts.token, this.opts.secret)
    .accept('json')
    .end(function (err, res) {
      if (!res.ok) return deferred.reject(res.body);
      return deferred.resolve(res.body);
    });

  return deferred.promise;
};

// Pull a useful listings array out of the depths of the response
var useful = function (result) {
  var x;
  if ((x = result) && (x = result['realestates.realEstates']) && (x = x['realEstateList']) && (x = x['realEstateElement'])) {
    // We get a single object in realEstateElement if there's only one, ensure we have a single element array
    return x.length ? x : [x];
  } else if (typeof x === 'string') {
    return [];
  } else {
    throw new Error('Invalid real estate list');
  }
};
