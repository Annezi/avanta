type LogoProps = {
  className?: string;
  /** Light-on-dark or dark-on-light text */
  variant?: "dark" | "light";
};

export function Logo({ className = "", variant = "dark" }: LogoProps) {
  const textColor = variant === "dark" ? "text-neutral-900" : "text-white";
  return (
    <span
      className={`inline-flex items-baseline select-none font-bold text-2xl sm:text-3xl tracking-tight ${textColor} ${className}`}
      aria-label="AvantaPrint"
    >
      <span>A</span>
      <span style={{ color: "#FF0478" }}>v</span>
      <span>antaPrint</span>
    </span>
  );
}
