type OptickBrandProps = {
  variant: 'sidebar' | 'sidebarCompact' | 'login' | 'contact'
  showSubtitle?: boolean
}

export default function OptickBrand({ variant, showSubtitle = true }: OptickBrandProps) {
  if (variant === 'contact') {
    return (
      <div className="text-center">
        <img
          src="/logo-optick-3d.png"
          alt="Optick Cloud"
          className="w-24 h-24 sm:w-28 sm:h-28 mx-auto mb-5 object-contain drop-shadow-2xl"
        />
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
          Optick{' '}
          <span className="font-semibold text-cyan-400/90">Cloud</span>
        </h1>
        {showSubtitle && (
          <p className="text-slate-400 text-sm sm:text-base mt-2">CRM en la nube</p>
        )}
      </div>
    )
  }

  if (variant === 'sidebarCompact') {
    return (
      <img
        src="/logo-optick.png"
        alt="Optick Cloud"
        className="w-9 h-9 rounded-lg object-contain shrink-0 bg-white/10 p-0.5"
      />
    )
  }

  if (variant === 'sidebar') {
    return (
      <div className="flex items-center gap-2.5 min-w-0">
        <img
          src="/logo-optick.png"
          alt="Optick Cloud"
          className="w-9 h-9 rounded-lg object-contain shrink-0 bg-gray-100 p-0.5"
        />
        <div className="min-w-0">
          <p className="text-gray-900 font-bold text-sm leading-tight tracking-tight">
            Optick{' '}
            <span className="font-semibold text-gray-600">Cloud</span>
          </p>
          {showSubtitle && (
            <p className="text-gray-500 text-[11px] leading-tight truncate">CRM Llamadas</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="text-center mb-8">
      <img
        src="/logo-optick.png"
        alt="Optick Cloud"
        className="w-16 h-16 mx-auto mb-4 rounded-2xl object-contain shadow-lg ring-1 ring-gray-100"
      />
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
        Optick{' '}
        <span className="font-semibold text-teal-600">Cloud</span>
      </h1>
      {showSubtitle && (
        <p className="text-gray-500 text-sm mt-1">CRM Llamadas</p>
      )}
    </div>
  )
}
