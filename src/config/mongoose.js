const mongoose = require("mongoose");
const logger = require("./logger");
const { getConfig } = require("./vars");

const config = getConfig();

// set mongoose Promise to Bluebird
mongoose.Promise = Promise;

// Exit application on error
mongoose.connection.on("error", (err) => {
  console.log("Error: ", err);
  logger.error(`MongoDB connection error: ${err}`);
  process.exit(-1);
});

// print mongoose logs in dev env
if (config?.env === "development" || config?.env === "local") {
  mongoose.set("debug", true);
}

/**
 * Connect to mongo db
 *
 * @returns {object} Mongoose connection
 * @public
 */
exports.connect = () => {
  let mongooseConfig = {
    useCreateIndex: true,
    keepAlive: 1,
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
    // tlsCAFile: `${__dirname}/global-bundle.pem`
  };
  // if (config.env !== "local") {
  //   mongooseConfig.tlsCAFile = `${__dirname}/global-bundle.pem`;
  // }

  mongoose
    .connect(config.mongo.uri, mongooseConfig)
    .then(() => console.log("mongoDB connected..."))
    .catch((err) => console.error("MongoDB connection error:", err));
  return mongoose.connection;
};
