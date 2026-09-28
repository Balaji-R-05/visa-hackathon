export default function Logo({ size = 34, withText = true, className = "" }) {
    return (
        <span className={`inline-flex items-center gap-2.5 ${className}`}>
            <img src="/assets/logo.svg" width={size} height={size} alt="Assay logo" className="rounded-[10px] shadow-lg shadow-indigo-600/30" />
            {withText && <span className="font-bold text-xl tracking-tight text-white">Assay</span>}
        </span>
    );
}
