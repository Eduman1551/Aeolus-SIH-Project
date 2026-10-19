// Plain-English names and explanations for the 8 KPIs (values always come from the backend).
export const KPI_COPY: Record<string, { name: string; line: string; tip: string }> = {
  planning_time: {
    name: "Planning time",
    line: "How long Aeolus took to build the first plan.",
    tip: "Compared with a quick automatic method (greedy) and with an assumed 180-minute manual plan.",
  },
  replan_time: {
    name: "Replan time",
    line: "From an event arriving to a new plan ready for approval.",
    tip: "Prepared answers (cache hits) are near-instant; new situations are solved fresh (cache misses).",
  },
  priority_coverage: {
    name: "Priority missions covered",
    line: "Share of P1 and P2 missions that have aircraft and crew.",
    tip: "P1 is critical, P2 high priority. Aim: every P1 mission whenever it is possible.",
  },
  violations: {
    name: "Rule problems",
    line: "Rules broken by the plan, found by an independent checker.",
    tip: "The checker re-reads the raw data and checks 18 rules, such as crew hours, weapon stock and weather limits. Should always be 0.",
  },
  utilisation: {
    name: "Resource use",
    line: "Flying hours and crew duty used, out of what is available.",
    tip: "Higher means scarce aircraft and crews are put to work. Compared with the quick greedy method.",
  },
  stability: {
    name: "Plan stability",
    line: "How much of the plan had to change after the last event.",
    tip: "Aeolus tries to change as little as possible so crews are not re-briefed needlessly. Aim: under 15% per event.",
  },
  cache_hit_rate: {
    name: "Prepared answers used",
    line: "Events answered from plans Aeolus prepared in advance.",
    tip: "After each approval, Aeolus pre-solves the likeliest problems (cache). A hit means the answer was ready.",
  },
  explanation_coverage: {
    name: "Changes explained",
    line: "Share of plan changes shown with a plain reason.",
    tip: "Every change should come with a reason. Aim: 100%.",
  },
};

export const HOME_KPIS = ["planning_time", "priority_coverage", "violations", "replan_time"];
