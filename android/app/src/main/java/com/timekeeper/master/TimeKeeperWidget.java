package com.timekeeper.master;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class TimeKeeperWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.timekeeper_widget);
            views.setTextViewText(R.id.widget_date, new SimpleDateFormat("EEEE • MMMM d, yyyy", Locale.getDefault()).format(new Date()));
            Intent intent = new Intent(context, MainActivity.class);
            PendingIntent pending = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pending);
            manager.updateAppWidget(id, views);
        }
    }
}
