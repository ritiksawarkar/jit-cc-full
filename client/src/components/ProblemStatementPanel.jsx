import React from "react";

const STORAGE_KEY = "compiler-problem-statement";

const DEFAULT_STATEMENT = `Smart India Hackathon 2025: Develop a unified citizen service portal that aggregates schemes, eligibility checks, and application tracking across central and state departments. The solution should
- provide multilingual support for at least three Indian languages,
- leverage AI to recommend relevant schemes based on user profiles,
- ensure accessibility for low-bandwidth regions, and
- offer secure integrations for departmental data exchange via open APIs.`;

export default function ProblemStatementPanel() {
    const [problemStatement, setProblemStatement] = React.useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved || DEFAULT_STATEMENT;
        } catch {
            return DEFAULT_STATEMENT;
        }
    });

    React.useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, problemStatement);
            window.dispatchEvent(
                new CustomEvent("problem-statement-updated", {
                    detail: { value: problemStatement },
                }),
            );
        } catch {
            // ignore persistence errors
        }
    }, [problemStatement]);

    React.useEffect(() => {
        const onSync = (event) => {
            const value = event?.detail?.value;
            if (typeof value === "string") {
                setProblemStatement(value);
            }
        };

        window.addEventListener("problem-statement-updated", onSync);
        return () => window.removeEventListener("problem-statement-updated", onSync);
    }, []);

    return (
        <div className="ui-surface flex h-full min-h-0 flex-col bg-gray-900/60 shadow-lg">
            <div className="ui-header">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-cyan-200/90">
                    Problem Statement
                </h2>
            </div>

            <div className="min-h-0 flex-1 p-2.5 sm:p-3.5">
                <textarea
                    value={problemStatement}
                    onChange={(e) => setProblemStatement(e.target.value)}
                    placeholder="Document the challenge, constraints, and expected behavior here..."
                    className="h-full min-h-[180px] w-full resize-none rounded-lg border border-cyan-500/20 bg-gray-800/80 p-3 font-mono text-sm leading-6 text-cyan-100 placeholder:text-cyan-100/40 outline-none transition-all duration-200 focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/20"
                />
            </div>
        </div>
    );
}
