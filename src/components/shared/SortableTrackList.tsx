'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Track } from '@/types';
import { GripVertical, X, Play, Pause } from 'lucide-react';
import { usePlayer } from '@/hooks/usePlayer';
import Image from 'next/image';

interface SortableTrackListProps {
  tracks: Track[];
  onReorder: (tracks: Track[]) => void;
  onRemove?: (trackId: string) => void;
  renderActions?: (track: Track) => React.ReactNode;
  showDragHandle?: boolean;
}

interface SortableTrackItemProps {
  tracks: Track[];
  track: Track;
  index: number;
  onRemove?: () => void;
  renderActions?: () => React.ReactNode;
  showDragHandle?: boolean;
}

function SortableTrackItem({ track, tracks, index, onRemove, renderActions, showDragHandle = true }: SortableTrackItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: track.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 'auto',
    position: 'relative' as const,
  };

  const { currentTrack, isPlaying, play, pause } = usePlayer();

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentTrack?.id === track.id) {
      if (isPlaying) {
        pause();
      } else {
        play(track, tracks);
      }
    } else {
      play(track, tracks);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 bg-crwn-bg rounded-lg p-2 whitespace-nowrap min-w-max ${isDragging ? 'opacity-80 shadow-lg' : ''}`}
    >
      {showDragHandle && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="p-1 text-crwn-text-secondary hover:text-crwn-text cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      )}
      <span className="w-6 text-center text-crwn-text-secondary text-sm">{index + 1}</span>
      <div className="w-10 h-10 bg-crwn-elevated rounded overflow-hidden flex-shrink-0">
        {track.album_art_url ? (
          <Image src={track.album_art_url} alt={track.title} width={40} height={40} className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-crwn-text-secondary text-sm">🎵</div>
        )}
      </div>
      <span className="flex-1 text-crwn-text whitespace-nowrap">{track.title}</span>
      <span className="text-crwn-text-secondary text-sm">{formatDuration(track.duration)}</span>
      <button
        type="button"
        onClick={handlePlayPause}
        className="neu-icon-button p-2"
      >
        {currentTrack?.id === track.id && isPlaying ? (
          <Pause className="w-4 h-4 text-crwn-bg" />
        ) : (
          <Play className="w-4 h-4 text-crwn-bg" />
        )}
      </button>
      {renderActions && renderActions()}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="p-1 text-crwn-error hover:bg-crwn-error/10 rounded"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function SortableTrackList({
  tracks,
  onReorder,
  onRemove,
  renderActions,
  showDragHandle = true,
}: SortableTrackListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tracks.findIndex((t) => t.id === active.id);
      const newIndex = tracks.findIndex((t) => t.id === over.id);
      onReorder(arrayMove(tracks, oldIndex, newIndex));
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={tracks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="overflow-x-auto"><div className="space-y-2 min-w-max">
          {tracks.map((track, index) => (
            <SortableTrackItem
              key={track.id}
              track={track}
              tracks={tracks}
              index={index}
              onRemove={onRemove ? () => onRemove(track.id) : undefined}
              renderActions={renderActions ? () => renderActions(track) : undefined}
              showDragHandle={showDragHandle}
            />
          ))}
        </div>
      </div></SortableContext>
    </DndContext>
  );
}
