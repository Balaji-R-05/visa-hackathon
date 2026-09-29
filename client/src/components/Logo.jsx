export default function Logo({ size = 32, withText = true, className = "" }) {
    return (
        <span className={`inline-flex items-center gap-2.5 ${className}`}>
            <img src="/vite.svg" width={size} height={size} alt="Assay logo" />
            {withText && <span className="font-bold text-xl tracking-tight text-white">Assay</span>}
        </span>
    );
}
