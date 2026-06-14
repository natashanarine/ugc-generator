/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'fluent-ffmpeg'],
  },
  // Allow serving files from /data/output as static assets via API
}

module.exports = nextConfig
