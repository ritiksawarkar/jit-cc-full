import axios from "axios";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createJudge0Client({ host, apiKey }) {
  const baseURL = `https://${host}`;
  const headers = {
    "x-rapidapi-key": apiKey,
    "x-rapidapi-host": host,
    "Content-Type": "application/json",
  };

  const b64 = (s) => Buffer.from(s || "", "utf8").toString("base64");
  const ub64 = (s) => (s ? Buffer.from(s, "base64").toString("utf8") : "");

  async function execute({
    language_id,
    source_code,
    stdin = "",
    cpu_time_limit,
    cpu_extra_time,
    wall_time_limit,
    memory_limit,
    expected_output,
  }) {
    const payload = {
      language_id,
      source_code: b64(source_code),
      stdin: b64(stdin),
    };

    if (cpu_time_limit !== undefined && cpu_time_limit !== null) {
      payload.cpu_time_limit = Number(cpu_time_limit);
    }
    if (cpu_extra_time !== undefined && cpu_extra_time !== null) {
      payload.cpu_extra_time = Number(cpu_extra_time);
    }
    if (wall_time_limit !== undefined && wall_time_limit !== null) {
      payload.wall_time_limit = Number(wall_time_limit);
    }
    if (memory_limit !== undefined && memory_limit !== null) {
      payload.memory_limit = Number(memory_limit);
    }
    if (expected_output !== undefined && expected_output !== null) {
      payload.expected_output = b64(String(expected_output));
    }

    // Create submission (no wait)
    const submit = await axios({
      method: "POST",
      url: `${baseURL}/submissions`,
      headers,
      params: { base64_encoded: true, wait: false, fields: "*" },
      data: payload,
    });

    const token = submit?.data?.token;
    if (!token) throw new Error("Judge0 submission failed (missing token)");

    // Poll until completed
    const start = Date.now();
    while (true) {
      const poll = await axios({
        method: "GET",
        url: `${baseURL}/submissions/${token}`,
        headers,
        params: { base64_encoded: true, fields: "*" },
      });
      const statusId = poll?.data?.status?.id || 0; // 1 queued, 2 processing, >=3 done
      if (statusId >= 3) {
        return {
          ...poll.data,
          stdout: ub64(poll.data?.stdout),
          stderr: ub64(poll.data?.stderr),
          compile_output: ub64(poll.data?.compile_output),
          message: ub64(poll.data?.message),
          timeMs: Date.now() - start,
        };
      }
      if (Date.now() - start > 40000)
        throw new Error("Judge0 polling timed out");
      await sleep(1200);
    }
  }

  return { execute };
}
