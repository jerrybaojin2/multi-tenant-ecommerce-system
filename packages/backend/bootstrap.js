const { Bootstrap } = require('@midwayjs/bootstrap');

Bootstrap.configure({
  // Production starts from compiled output. Local dev uses npm run dev.
  // eslint-disable-next-line node/no-unpublished-require
  imports: require('./dist/index'),
  moduleDetector: false,
}).run();
