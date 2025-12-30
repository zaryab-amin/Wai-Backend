/* eslint-disable quotes */
const express = require("express");
const session = require("express-session");
const morgan = require("morgan");
const bodyParser = require("body-parser");
const compress = require("compression");
const methodOverride = require("method-override");
const cors = require("cors");
const helmet = require("helmet");
const passport = require("passport");
const path = require("path");
const cookieParser = require("cookie-parser");
const routes = require("../api/routes/v1");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const AzureAdOAuth2Strategy = require("passport-azure-ad-oauth2").Strategy;
const { getConfig } = require("./vars");
const strategies = require("./passport");
const jwt = require("jsonwebtoken");
const User = require("../api/models/user.model");
const Organization = require("../api/models/organization.model");
const error = require("../api/middlewares/error");
const Token = require("../api/models/token.model");
const emailProvider = require("../api/services/emails/emailProvider");
const { PRESCIENT_ORG_ID } = require("../api/utils/constant");
const { ObjectId, ObjectID } = require("mongodb");
const { handleWebhook } = require("../api/controllers/subscription.controller");
const {
  notifyOrgForInactiveUserUpgrade,
} = require("../api/controllers/auth.controller");
const mongoose = require("mongoose");

/**
 * Express instance
 * @public
 */
const config = getConfig();
const app = express();

const allowedOrigins = [
  "https://w-ai-partner-portal-frontend.vercel.app",
  "https://wai-partner-portal.fintra.ai",
  "http://34.46.200.23",
  "http://localhost:3000",
  "http://localhost:5173",
];

const corsOptions = {
  origin(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, health checks)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("CORS not allowed"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Origin",
    "X-Requested-With",
    "Accept",
    "ngrok-skip-browser-warning",
    "bypass-tunnel-reminder",
  ],
  exposedHeaders: ["Set-Cookie"],
  optionsSuccessStatus: 204,
};

const makeToken = (email) => {
  const expirationDate = new Date();
  // Set token expiration to 15 minutes to match database token expiration
  expirationDate.setMinutes(new Date().getMinutes() + 15);
  return jwt.sign({ email, expirationDate }, config.jwtSecret);
};

app.use(cookieParser());

app.set("view engine", "ejs");

app.use(
  session({
    secret: config.sessionKey,
    resave: false,
    saveUninitialized: true,
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.post("/webhook", express.raw({ type: "application/json" }), handleWebhook);

// // parse body params and attache them to req.body
// app.use(bodyParser.json());
// app.use(bodyParser.urlencoded({ extended: true }));

// fixing "413 Request Entity Too Large" errors
app.use(bodyParser.json({ limit: "500mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
app.use("/public", express.static(path.join(__dirname, "../public")));

// CORS configuration (must be before routes)
app.use(cors(corsOptions));

// Handle preflight OPTIONS requests globally with the same options
app.options("*", cors(corsOptions));

// gzip compression
app.use(compress());

// lets you use HTTP verbs such as PUT or DELETE
// in places where the client doesn't support it
app.use(methodOverride());

// secure apps by setting various HTTP headers
app.use(helmet());

// enable authentication
passport.serializeUser((user, done) => {
  done(null, { email: user.email, displayName: user.displayName });
});
passport.use("jwt", strategies.jwt);

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: config?.googleClientId,
      clientSecret: config?.googleClientSecret,
      callbackURL: `${config.serverHost}/auth/google/callback`,
      scope: ["profile", "email"],
    },
    // eslint-disable-next-line no-unused-vars
    async (accessToken, refreshToken, profile, done) => {
      const { displayName, emails } = profile;
      const email = emails[0].value;

      console.log(displayName);
      try {
        done(null, { email, displayName });
      } catch (err) {
        done(err);
      }
    }
  )
);

// passport.use(
//   new AzureAdOAuth2Strategy(
//     {
//       clientID: process.env.MICROSOFT_CLIENT_ID,
//       clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
//       callbackURL: `${process.env.SERVER_HOST}/auth/microsoft/callback`,
//       resource: "https://graph.microsoft.com",
//     },
//     async (accessToken, refresh_token, params, profile, done) => {
//       const response = await axios.get("https://graph.microsoft.com/v1.0/me", {
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//         },
//       });
//       let email = response.data.mail;
//       try {
//         let user = await User.findOne({ email });
//         if (!user) {
//           user = await User.create({
//             email,
//             name: displayName,
//             role: "user",
//           });
//         }
//         jwt.sign({ id: user._id }, process.env.JWT_SECRET);
//         done(null, user);
//       } catch (err) {
//         done(err);
//       }
//     }
//   )
// );

app.get("/auth/google", (req, res, next) => {
  const config = getConfig();
  const state =
    req.query.organizationId === "null"
      ? new ObjectId(config.prescientOrgId)
      : req.query.organizationId;

  console.log("Initial Request - Organization ID:", state);

  passport.authenticate("google", {
    scope: ["profile", "email"],
    state,
  })(req, res, next);
});

app.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/log",
  }),
  async (req, res) => {
    try {
      const { email, displayName } = req.session.passport.user;
      const organizationId =
        req.query.state === "null" || !req.query.state ? null : req.query.state;

      let organization = organizationId
        ? new ObjectId(organizationId)
        : new ObjectId(config.prescientOrgId);
      let user = await User.findOne({
        email,
        // organization
      });

      const token = makeToken(email);
      if (!user) {
        let userData = {
          name: displayName,
          email: email,
          organization,
        };

        console.log("organization-------------->", organization);
        if (
          mongoose.Types.ObjectId.isValid(organization) &&
          organization?.toString() !== config.prescientOrgId
        ) {
          const existingUsers = await User.find({ organization }).lean().exec();
          const existingOrganization = await Organization.findOne({
            _id: organization,
          }).populate("signatoryUser");

          const currentUsers = existingUsers.length;
          const { numberOfUsers } = existingOrganization;

          if (currentUsers >= numberOfUsers - 1) {
            await notifyOrgForInactiveUserUpgrade(
              {
                ...userData,
                organization: organization,
              },
              existingOrganization?.signatoryUser
            );
            return res.redirect(
              `${config?.clientURL}/?message=Your organization has reached the user limit. Please request an account upgrade.`
            );
          }
        }

        user = await new User({
          ...userData,
          isActivated: true,
          organization,
        }).save();
      }

      console.log("user-------------->", user);

      if (user?.organization?.toString() !== organization?.toString()) {
        return res.redirect(
          `${config?.clientURL}/?message=We couldn't find your account for this organization`
        );
      }
      if (!user.isActivated) {
        emailProvider.sendEmailVerification(user, token);
        return res.redirect(
          `${config?.clientURL}/?message=Your account is deactivated please contact the administrator`
        );
      }

      if (user?.inviteKey && !user?.isInviteAccepted) {
        return res.redirect(
          `${config?.clientURL}/?message=Please accept the invite first.`
        );
      }

      const tokenRecord = new Token({
        token,
        email,
        isUsed: false,
        expiresAt: new Date(new Date().getTime() + 15 * 60 * 1000),
        organization: user?.organization,
      });
      await tokenRecord.save();
      return res.redirect(`${config?.clientURL}/google/?auth=${token}`);
    } catch (error) {
      console.log("error-------------->", error);
      return res.redirect(`${config?.clientURL}/?message=something-went-wrong`);
    }
  }
);

// app.get("/auth/microsoft", passport.authenticate("azure_ad_oauth2"));

// app.get(
//   "/microsoft/callback",
//   passport.authenticate("azure_ad_oauth2", {
//     failureRedirect: "/log",
//   }),
//   async (req, res) => {
//     try {
//       const { email, isActivated } = req.user;
//       const token = makeToken(email);
//       const tokenRecord = new Token({
//         token,
//         email,
//         isUsed: false,
//         expiresAt: new Date(new Date().getTime() + 15 * 60 * 1000),
//       });
//       await tokenRecord.save();

//       if (!isActivated) {
//         emailProvider.sendEmailVerification(req.user, token);
//         return res.redirect(`${config?.clientURL}/?message=verification-required.`);
//       }
//       console.log("recorded token: " + tokenRecord);
//       return res.redirect(`${config?.clientURL}/microsoft/?auth=${token}`);
//     } catch (error) {
//       return res.redirect(`${config?.clientURL}/?message=something-went-wrong`);
//     }
//   }
// );

// mount api v1 routes
app.use("/v1", routes);

// if error is not an instanceOf APIError, convert it.
app.use(error.converter);

// catch 404 and forward to error handler
app.use(error.notFound);

// error handler, send stacktrace only during development
app.use(error.handler);

module.exports = app;
