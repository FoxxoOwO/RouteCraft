import React, { useState } from 'react';
import {
  HARDWARE_CATALOG,
  DeviceModel,
  VendorId,
} from '../types/devices';
import {
  Boxes,
  Network,
  Server,
  Monitor,
  HardDrive,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Plus,
  Search,
  CheckCircle2,
} from 'lucide-react';

interface Props {
  onAddDevice: (model: DeviceModel, x?: number, y?: number) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export const DeviceCatalogDrawer: React.FC<Props> = ({
  onAddDevice,
  isOpen,
  onToggleOpen,
}) => {
  const [selectedVendorId, setSelectedVendorId] = useState<VendorId>('cisco');
  const [searchQuery, setSearchQuery] = useState('');
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);

  const selectedVendor =
    HARDWARE_CATALOG.find((v) => v.id === selectedVendorId) || HARDWARE_CATALOG[0];

  // Filter models either by vendor or by search query across all vendors
  const displayedModels = searchQuery.trim()
    ? HARDWARE_CATALOG.flatMap((v) => v.models).filter(
        (m) =>
          m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.categoryLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.vendorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.interfaces.some((iface) =>
            iface.toLowerCase().includes(searchQuery.toLowerCase())
          )
      )
    : selectedVendor.models;

  const handleDragStart = (e: React.DragEvent, model: DeviceModel) => {
    e.dataTransfer.setData('application/routecraft-device', JSON.stringify(model));
    e.dataTransfer.effectAllowed = 'copy';

    // Transparent / styled drag ghost image or feedback
    const dragPreview = document.createElement('div');
    dragPreview.style.position = 'absolute';
    dragPreview.style.top = '-1000px';
    dragPreview.innerText = model.name;
    document.body.appendChild(dragPreview);
    e.dataTransfer.setDragImage(dragPreview, 0, 0);
    setTimeout(() => document.body.removeChild(dragPreview), 0);
  };

  const handleAddClick = (model: DeviceModel) => {
    onAddDevice(model);
    setRecentlyAddedId(model.id);
    setTimeout(() => setRecentlyAddedId(null), 1200);
  };

  const getDeviceIcon = (iconType: string, className = 'w-6 h-6') => {
    switch (iconType) {
      case 'router':
        return <Network className={className} />;
      case 'switch':
        return <Server className={className} />;
      case 'server':
        return <HardDrive className={className} />;
      case 'host':
      default:
        return <Monitor className={className} />;
    }
  };

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 z-30 bg-[#0E1526]/95 backdrop-blur-md border-t border-gray-800 shadow-2xl transition-all duration-300 flex flex-col ${
        isOpen ? 'h-72' : 'h-11'
      }`}
    >
      {/* Drawer Header Bar (Always Visible) */}
      <div className="h-11 px-4 flex items-center justify-between border-b border-gray-800/80 shrink-0 bg-[#111A2E]/90 select-none">
        {/* Left: Title & Toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleOpen}
            className="flex items-center gap-2 text-xs font-bold text-slate-100 hover:text-cyan-400 transition-colors cursor-pointer group"
          >
            <div className="p-1 rounded bg-blue-600/30 text-cyan-400 border border-blue-500/40 group-hover:scale-105 transition-transform">
              <Boxes className="w-3.5 h-3.5" />
            </div>
            <span className="tracking-wide">Katalog zařízení (Hardware Drawer)</span>
            <span className="px-1.5 py-0.2 rounded-full bg-gray-800 text-[10px] text-slate-400 font-mono">
              {HARDWARE_CATALOG.flatMap((v) => v.models).length} modelů
            </span>
            {isOpen ? (
              <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
            ) : (
              <ChevronUp className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
            )}
          </button>

          {/* Vendor Quick-Select Pills (Visible when collapsed or expanded) */}
          <div className="h-4 w-px bg-gray-800 mx-1 hidden sm:block" />
          <div className="hidden sm:flex items-center gap-1.5">
            {HARDWARE_CATALOG.map((v) => {
              const isSelected = selectedVendorId === v.id && !searchQuery.trim();
              return (
                <button
                  key={v.id}
                  onClick={() => {
                    setSelectedVendorId(v.id);
                    setSearchQuery('');
                    if (!isOpen) onToggleOpen();
                  }}
                  className={`px-2.5 py-0.5 rounded text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 border ${
                    isSelected
                      ? `${v.accentBg} ${v.accentBorder} ${v.accentText} shadow-sm`
                      : 'bg-gray-800/60 hover:bg-gray-800 text-slate-400 hover:text-slate-200 border-gray-800'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: v.logoColor }}
                  />
                  <span>{v.name.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Search Input & Status hint */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Hledat model (2911, CRS, FRR...)"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!isOpen) onToggleOpen();
              }}
              className="bg-black/40 border border-gray-800 focus:border-cyan-500 rounded-lg pl-8 pr-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 outline-none w-44 md:w-56 transition-all"
            />
          </div>

          <button
            onClick={onToggleOpen}
            className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded bg-gray-800/60 hover:bg-gray-800 transition-colors cursor-pointer"
            title={isOpen ? 'Zabalit šuplík' : 'Rozbalit šuplík'}
          >
            {isOpen ? 'Zabalit' : 'Rozbalit'}
          </button>
        </div>
      </div>

      {/* Expanded Catalog Drawer Content */}
      {isOpen && (
        <div className="flex-1 flex overflow-hidden">
          {/* Vendor Sidebar (Výběr výrobce) */}
          <div className="w-48 bg-[#090D1A] border-r border-gray-800 p-2 flex flex-col gap-1 overflow-y-auto shrink-0 select-none">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 py-1">
              Výrobce / Systém
            </div>

            {HARDWARE_CATALOG.map((vendor) => {
              const isSelected = selectedVendorId === vendor.id && !searchQuery.trim();
              return (
                <button
                  key={vendor.id}
                  onClick={() => {
                    setSelectedVendorId(vendor.id);
                    setSearchQuery('');
                  }}
                  className={`w-full text-left p-2 rounded-xl transition-all cursor-pointer flex items-center justify-between border ${
                    isSelected
                      ? `${vendor.accentBg} ${vendor.accentBorder} text-white shadow-md`
                      : 'bg-transparent hover:bg-gray-800/40 border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: vendor.logoColor }}
                    />
                    <div>
                      <div className="text-xs font-semibold leading-tight">
                        {vendor.name}
                      </div>
                      <div className="text-[10px] text-slate-500 leading-tight">
                        {vendor.badge}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-slate-400">
                    {vendor.models.length}
                  </span>
                </button>
              );
            })}

            <div className="mt-auto p-2 bg-blue-950/20 border border-blue-900/40 rounded-xl text-[10px] text-blue-300">
              <span className="font-semibold block mb-0.5">Tip pro studenty:</span>
              Přetáhněte model myší na plochu pro přesné umístění.
            </div>
          </div>

          {/* Model Cards Carousel / Grid (Přehled jednotlivých modelů) */}
          <div className="flex-1 p-3 overflow-x-auto overflow-y-hidden flex items-center gap-3">
            {displayedModels.length === 0 ? (
              <div className="w-full flex flex-col items-center justify-center text-slate-500 text-xs py-8">
                <Boxes className="w-8 h-8 mb-2 opacity-40" />
                <span>Nebylo nalezeno žádné zařízení odpovídající filtru.</span>
              </div>
            ) : (
              displayedModels.map((model) => {
                const isRecentlyAdded = recentlyAddedId === model.id;
                return (
                  <div
                    key={model.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, model)}
                    className="w-64 h-52 bg-[#131D33] hover:bg-[#182440] border border-gray-800 hover:border-cyan-500/60 rounded-xl p-3 shrink-0 flex flex-col justify-between transition-all duration-200 shadow-lg group hover:shadow-cyan-900/20 cursor-grab active:cursor-grabbing select-none relative"
                    title="Přetáhněte zařízení do workspace nebo klikněte na + Přidat"
                  >
                    {/* Top Row: Type Pill, Vendor & Drag Indicator */}
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`p-1.5 rounded-lg border ${model.badgeColor}`}
                        >
                          {getDeviceIcon(model.iconType, 'w-4 h-4')}
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-black/50 text-slate-400 border border-gray-800 font-mono">
                            {model.deviceType.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-[10px] text-slate-500 group-hover:text-cyan-400 transition-colors">
                        <GripVertical className="w-3.5 h-3.5" />
                        <span className="hidden group-hover:inline font-mono">
                          Drag
                        </span>
                      </div>
                    </div>

                    {/* Middle: Name & Specs */}
                    <div className="my-1">
                      <h4 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors leading-snug">
                        {model.name}
                      </h4>
                      <p className="text-[11px] font-medium text-slate-400 leading-tight">
                        {model.categoryLabel}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                        {model.description}
                      </p>
                    </div>

                    {/* Interfaces List */}
                    <div className="bg-black/40 rounded-lg p-1.5 border border-gray-800/80">
                      <div className="text-[9px] uppercase font-bold text-slate-400 mb-0.5 flex justify-between">
                        <span>Rozhraní</span>
                        <span className="font-mono text-cyan-400">
                          {model.interfaces.length} portů
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 max-h-9 overflow-hidden">
                        {model.interfaces.slice(0, 4).map((iface) => (
                          <span
                            key={iface}
                            className="text-[9px] font-mono px-1 py-0.2 rounded bg-gray-800 text-slate-300"
                          >
                            {iface}
                          </span>
                        ))}
                        {model.interfaces.length > 4 && (
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-gray-800 text-slate-400">
                            +{model.interfaces.length - 4} další
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom Action Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddClick(model);
                      }}
                      className={`w-full mt-2 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        isRecentlyAdded
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                          : 'bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/40 hover:border-blue-500'
                      }`}
                    >
                      {isRecentlyAdded ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Přidáno na plátno!</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ Přidat na plochu</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
