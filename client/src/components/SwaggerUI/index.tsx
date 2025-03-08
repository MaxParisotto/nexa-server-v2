import React from 'react';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-dist/swagger-ui.css';

const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Nexa API Documentation',
    version: '1.0.0',
  },
  paths: {},
};

export const SwaggerUIComponent = () => (
  <SwaggerUI spec={swaggerDocument} />
);
