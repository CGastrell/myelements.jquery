var path = require("path"),
  extend = require("extend"),
  http = require("http"),
  io = require('socket.io'),
  util = require('util'),
  UglifyJS = require("uglify-js"),
  debug = require("debug")("myelements:server"),
  ElementsEventHandler = require("./elements-event-handler"),
  sharedSession = require("express-socket.io-session"),
  clientVersion = require('../package').version;


var config = {
  socketNamespace: "/myelements",
  session: undefined
};

module.exports = Server;
/**
 * Attachs a myelements handler to an express app (for emiting events on client
 * connection) and an http/https server for receiving client side events.
 * @param {express.App} app. An express request handler (express app)
 * @param {http.Server} httpServer. An http/https server to attach socket.io
 * @param {Object} options. 
 *   - {String} socketNamespace: . Default `/myelements`
 *   - {Function} session: an express session middleware as the one returned 
       by require("express-session")({...});
 */
function Server(app, httpServer, options) {
  if (!(this instanceof Server)) {
    return new Server(app, httpServer, options);
  }
  config = extend({}, config, options);
  this.attach = attach;
  this.serveClient = serveClientOnExpressRoute;
  this.attach(app, httpServer);
}
/**
 * @param {express.App}
 * @param {http.Server}
 */
function attach(app, httpServer) {
  //Attach routes for browser client library
  if (app.use === undefined) {
    throw new Error("Unknown express() object passed to myelements. Please pass an " +
      "an express app (request handler function)");
  }
  if (!(httpServer instanceof http.Server)) {
    throw new Error("Unknown server object passed to myelements. Please pass an " +
      "http.Server as second parameters");
  }
  serveClientOnExpressRoute(app);
  attachToHttpServer(httpServer, function onClientConnection(err, elementsEventHandler) {
    app.emit("myelements client connected", elementsEventHandler);
  });
}

/**
 * Listen for socket.io events on httpServer.
 *
 * @param {http.Server} httpServer. The server to attach socket.io to.
 * @param {Function} onConnectionCallback. Called when a socket client connects.
 *   - @param {Error} err. Null if nothing bad happened.
 *   - @param {EventEmitter} client. Event client.
 */
function attachToHttpServer(httpServer, onConnectionCallback) {
  // socket.io 

  var sockets = io.listen(httpServer);
  debug("Attaching to http.Server");
  attachToSocketIo(sockets, onConnectionCallback);

}

/**
 * @param {io.Server} sockets
 */
function attachToSocketIo(sockets, onConnectionCallback) {
  // Communicate with client via myelements namespace
  var namespacedSockets = sockets.of(config.socketNamespace);
  // User express-session function passed as options
  // to myelements
  if (config.session) {
    debug("Using express session");

    namespacedSockets.use(sharedSession(config.session));
  }
  debug("Listening for socket.io client connections on namespace %s",
    config.socketNamespace);
  namespacedSockets.on('connection', function onSocketConnection(clientSocket) {
    onClientConnection(clientSocket, onConnectionCallback)
  });
}

function onClientConnection(clientSocket, onConnectionCallback) {

  var elementsEventHandler = new ElementsEventHandler(clientSocket);
  elementsEventHandler.session = clientSocket.handshake.session;
  debug("myelements client connected");

  onConnectionCallback(null, elementsEventHandler);
  elementsEventHandler.on("disconnect", function deleteElementsEventHandler() {
    delete elementsEventHandler;
  });
}

/**
 * Defines the route /events/client.js and serves up the browser javascript code
 * The client depends on jQuery and socket.io client being already loaded
 * @param {Express}
 */
function serveClientOnExpressRoute(app) {
  var join = path.join;
  var sources = [
    require.resolve('socket.io-client/socket.io.js'),
    join(__dirname, "client", "lib/ejs/ejs_0.9_alpha_1_production.js"),
    join(__dirname, "client", "lib/page.js/page.js"),
    join(__dirname, "client", "lib/localforage/localforage.js"),
    join(__dirname, "client", "lib/debug/debug.js"),
    join(__dirname, "client", "lib/jquery.ui.widget/jquery.ui.widget.js"),
    join(__dirname, "client", "myelements.jquery.js")
  ];
  app.get("/myelements.jquery.js", function(req, res, next) {
    res.setHeader("Content-type", "application/javascript");
    var result = UglifyJS.minify(sources, {
      mangle: false,
      compress: false
    });
    res.send(result.code);
    //res.sendFile(path.join(__dirname, "client.js"));
  });
}
