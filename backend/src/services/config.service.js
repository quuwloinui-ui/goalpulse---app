'use strict';
const { DEFAULT_FEATURES } = require('../config/features');

const KEY = 'cfg:public';

/** Public remote config: feature toggles + active banners (cached 30 s, busted by admin edits). */
function createConfigService({ prisma, cache }) {
  const publicConfig = () =>
    cache.wrap(KEY, 30, async () => {
      const now = new Date();
      const [flags, banners] = await Promise.all([
        prisma.featureFlag.findMany(),
        prisma.banner.findMany({
          where: {
            isActive: true,
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            ],
          },
          orderBy: [{ priority: 'asc' }, { id: 'desc' }],
        }),
      ]);
      const features = { ...DEFAULT_FEATURES };
      for (const f of flags) features[f.key] = f.enabled;
      return {
        features,
        banners: features.ads
          ? banners.map(({ id, title, imageUrl, targetUrl, placement }) => ({ id, title, imageUrl, targetUrl, placement }))
          : [],
      };
    });

  const isEnabled = async (key) => (await publicConfig()).features[key] !== false;
  const invalidate = () => cache.del(KEY);

  return { publicConfig, isEnabled, invalidate };
}

module.exports = { createConfigService };
