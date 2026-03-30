const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Smart Persona API",
      version: "1.0.0",
      description: "API Documentation for Smart Persona",
    },
    servers: [
      {
        url: "http://localhost:3000",
      },
    ],

    // 🔥 เพิ่มตรงนี้
    security: [
      {
        bearerAuth: [],
      },
    ],

    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: ["./routes/*.js"],
};

module.exports = swaggerJsdoc(options);
