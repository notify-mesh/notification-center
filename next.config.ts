import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    allowDevelopmentBuild: true,
    appNavFailHandling: true,
    appNewScrollHandler: true,
    authInterrupts: true,
    cachedNavigations: true,
    clientRouterFilter: true,
    clientRouterFilterRedirects: true,
    gestureTransition: true,
    viewTransition: true,
    useSkewCookie: true,
    useCache: true,
    typedEnv: true,
    varyParams: true,
    serverSourceMaps: true
  },
  cleanDistDir: true,
  enablePrerenderSourceMaps: true,
  typedRoutes: true,
  poweredByHeader: false,
  generateEtags: true,
};

export default nextConfig;
