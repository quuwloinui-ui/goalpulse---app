'use strict';
const ACTIVE_KEY = 'streams:active-fixtures';

/** Admin-curated stream links: lookups used by the public API. */
function createStreamsService({ prisma, cache, configService }) {
  const activeWhere = () => ({ isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] });

  const activeFixtureIds = () =>
    cache.wrap(ACTIVE_KEY, 60, async () => {
      const rows = await prisma.streamLink.findMany({ where: activeWhere(), select: { fixtureId: true }, distinct: ['fixtureId'] });
      return rows.map((r) => r.fixtureId);
    });

  async function forFixture(fixtureId) {
    if (!(await configService.isEnabled('streams'))) return [];
    return prisma.streamLink.findMany({
      where: { fixtureId, ...activeWhere() },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
      select: { id: true, title: true, url: true, type: true, quality: true, language: true },
    });
  }

  /** Adds `hasStream` to a list of fixtures with a single cached lookup. */
  async function mark(list) {
    if (!list.length) return list;
    const ids = (await configService.isEnabled('streams')) ? new Set(await activeFixtureIds()) : new Set();
    return list.map((f) => ({ ...f, hasStream: ids.has(f.id) }));
  }

  const invalidate = () => cache.del(ACTIVE_KEY);

  return { forFixture, mark, invalidate };
}

module.exports = { createStreamsService };
