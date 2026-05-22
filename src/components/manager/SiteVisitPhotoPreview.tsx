"use client";

export function SiteVisitPhotoPreview({
  photoUrl,
  siteName,
}: {
  photoUrl?: string | null;
  siteName?: string | null;
}) {
  if (!photoUrl) {
    return <p className="hint mt-12">No arrival proof photo uploaded.</p>;
  }

  const mediaUrl = `/api/media?url=${encodeURIComponent(photoUrl)}`;

  return (
    <div className="mt-12">
      <p className="hint">Arrival proof photo</p>

      <img
        src={mediaUrl}
        alt={`Site visit proof for ${siteName ?? "site visit"}`}
        style={{
          width: "100%",
          maxHeight: 260,
          objectFit: "contain",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          marginTop: 8,
        }}
      />

      <div className="button-row mt-12">
        <a className="button-ghost" href={mediaUrl} target="_blank" rel="noreferrer">
          View full photo
        </a>
      </div>
    </div>
  );
}
