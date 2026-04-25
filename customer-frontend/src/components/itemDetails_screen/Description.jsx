import { useState } from "react";

export default function Description({ text }) {

  const [expanded, setExpanded] = useState(false);

  if (!text) return null;

  const shortText = text.slice(0,120);

  return (
    <div className="mt-3 text-sm text-gray-600">

      {expanded ? text : shortText}

      {text.length > 120 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-1 text-green-700 font-medium"
        >
          {expanded ? " Read less" : "...Read more"}
        </button>
      )}

    </div>
  );
}