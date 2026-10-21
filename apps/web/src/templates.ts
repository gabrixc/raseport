/** A blank report: one empty body section, ready to drag blocks into. */
export const NEW_REPORT = {
  schemaVersion: 1,
  name: "New report",
  locale: "en-US",
  currency: "USD",
  params: [],
  datasets: [],
  body: [{ id: "band1", type: "body", rows: [] }],
};

export const newReportText = (): string => JSON.stringify(NEW_REPORT, null, 2);
