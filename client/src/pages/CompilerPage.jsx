import React from "react";
import FancyBackground from "../components/FancyBackground";
import Shell from "../components/Shell";

export default function CompilerPage() {
    return (
        <div className="relative min-h-screen overflow-hidden bg-gray-950">
            <FancyBackground />
            <Shell />
        </div>
    );
}
