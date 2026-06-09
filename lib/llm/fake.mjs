// Deterministic offline client used when PAPER_BOY_FAKE_LLM=1 (and by tests). It
// returns schema-shaped placeholder data without any network or key, so the
// fetch → enrich → render pipeline can be exercised end-to-end for free.
export function makeFakeClient() {
  return {
    model: 'fake',
    async complete({ prompt = '', schema } = {}) {
      if (!schema) return { ok: true, data: 'fake completion' };
      const req = schema.required || [];
      const data = {};
      if (req.includes('whatsNew')) {
        data.whatsNew = 'A new approach is proposed.';
        data.whyItMatters = 'It is relevant to practitioners.';
        data.summary = 'This paper describes a method and reports results, summarised from its abstract.';
        data.relevance = 0.8;
      }
      if (req.includes('clusters')) {
        // Echo back the ids embedded in the prompt so cluster membership is real.
        const ids = [...prompt.matchAll(/^- (\S+):/gm)].map((m) => m[1]);
        data.clusters = [{ name: 'General', synthesis: 'A shared theme.', paperIds: ids }];
      }
      if (req.includes('findings')) {
        data.findings = ['A concrete result.'];
        data.method = 'The described approach.';
        data.limitations = ['A stated limitation.'];
      }
      if (req.includes('trending')) data.trending = 'Activity is increasing in this area.';
      return { ok: true, data };
    },
  };
}
