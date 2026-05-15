import million from "million/compiler";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    allowDevelopmentBuild: true,
    appNavFailHandling: true,
    appNewScrollHandler: true,
    authInterrupts: true,
    clientRouterFilter: true,
    clientRouterFilterRedirects: true,
    gestureTransition: true,
    viewTransition: true,
    useSkewCookie: true,
    useCache: true,
    typedEnv: true,
    varyParams: true,
    serverSourceMaps: true,
    cachedNavigations: true,
  },
  cleanDistDir: true,
  enablePrerenderSourceMaps: true,
  typedRoutes: true,
  poweredByHeader: false,
  generateEtags: true,
  productionBrowserSourceMaps: true,
  bundlePagesRouterDependencies: true,
  cacheComponents: true,
  compress: true,
  reactStrictMode: true,
  logging: {
    incomingRequests: true,
    serverFunctions: true,
    browserToTerminal: true,
  },
  httpAgentOptions: {
    keepAlive: true,
  },
  reactProductionProfiling: true,
};

const millionConfig = {
  auto: { rsc: true },
};

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
export default million.next(nextConfig, millionConfig);
