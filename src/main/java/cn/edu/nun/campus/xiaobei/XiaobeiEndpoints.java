package cn.edu.nun.campus.xiaobei;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

public final class XiaobeiEndpoints {
    public record Endpoint(String key, String method, String path, Set<String> parameters) {
        public boolean personal() { return key.startsWith("jwxt."); }
    }

    private static final Map<String, Endpoint> ALL = new LinkedHashMap<>();

    static {
        add("campus.list", "GET", "/api/o/campus");
        add("campus.settings", "GET", "/api/o/settings");
        add("campus.map-calibration", "GET", "/api/o/map-calibration", "campusId", "campus_id", "provider");
        add("category.with-sites", "GET", "/api/o/category/with-sites");
        add("media.list", "GET", "/api/o/media");
        add("schoolguide.list", "GET", "/api/o/schoolguide");
        add("site.search", "GET", "/api/o/site/search", "campus_id", "content", "classroomBuilding");
        add("site.rank", "GET", "/api/o/site/rank", "campus_id", "current", "pageSize");
        add("site.detail", "GET", "/api/o/site/{id}");
        add("food.list", "GET", "/api/o/food/list", "category", "mealType", "searchText", "page", "pageSize", "orderField", "orderDir");
        add("food.sections", "GET", "/api/o/food/sections", "campus", "meal");
        add("club.list", "GET", "/api/o/club/list", "category", "searchText", "status", "page", "pageSize", "orderField", "orderDir");
        add("club.detail", "GET", "/api/o/club/{id}");
        add("dormitory.sites", "GET", "/api/o/dormitory/sites");
        add("dormitory.buildings", "GET", "/api/o/dormitory/buildings", "searchText", "orderField");
        add("dormitory.list", "GET", "/api/o/dormitory/list", "searchText", "page", "pageSize", "orderField", "orderDir");
        add("dormitory.detail", "GET", "/api/o/dormitory/{id}");
        add("activity.home", "GET", "/api/o/activity/home");
        add("activity.list", "GET", "/api/o/activity/list", "current", "size", "type", "keyword", "categoryId");
        add("activity.detail", "GET", "/api/o/activity/{id}", "trackView");
        add("activity.announcements", "GET", "/api/o/activity/{id}/announcements");
        add("lottery.list", "GET", "/api/o/lottery/list", "current", "size");
        add("lottery.detail", "GET", "/api/o/lottery/{id}");
        add("lottery.tasks", "GET", "/api/o/lottery/{id}/tasks");
        add("channel.categories", "GET", "/api/o/tencent-channel/categories");
        add("channel.meta", "GET", "/api/o/tencent-channel/meta");
        add("comment-room.list", "GET", "/api/o/comment-room/list", "current", "size");
        add("comment-room.detail", "GET", "/api/o/comment-room/{id}", "token");
        add("comment-room.comments", "GET", "/api/o/comment-room/{id}/comments", "current", "size", "token");
        add("space.buildings", "GET", "/api/o/space-map/buildings", "campusId", "campus_id");
        add("space.summary", "GET", "/api/o/space-map/summary", "campusId", "campus_id");
        add("space.search", "GET", "/api/o/space-map/search", "keyword", "q", "campusId", "campus_id");
        add("realtime.data", "GET", "/api/o/realtime-data");
        add("road.plan", "GET", "/api/o/road-network/plan", "start_lat", "start_lng", "end_lat", "end_lng", "campus_ids", "route_type");
        add("jwxt.captcha", "GET", "/api/jwxt/external/captcha");
        add("jwxt.auth", "POST", "/api/jwxt/external/auth", "studentNo", "studentId", "password", "captchaId", "authcode");
        add("jwxt.session-status", "GET", "/api/jwxt/external/session-status");
        add("jwxt.sync", "POST", "/api/jwxt/external/sync", "type");
        add("jwxt.session-revoke", "DELETE", "/api/jwxt/external/session");
        add("jwxt.schedule", "GET", "/api/jwxt/external/schedule", "semester", "week");
        add("jwxt.grades", "GET", "/api/jwxt/external/grades", "semester");
        add("jwxt.grade-summary", "GET", "/api/jwxt/external/grade-summary");
        add("jwxt.share-redeem", "POST", "/api/jwxt/external/share-redeem", "shareCode");
        add("jwxt.share-status", "GET", "/api/jwxt/external/share-status");
        add("jwxt.share-revoke", "DELETE", "/api/jwxt/external/share");
    }

    private static void add(String key, String method, String path, String... parameters) {
        ALL.put(key, new Endpoint(key, method, path, Set.of(parameters)));
    }

    public static Map<String, Endpoint> all() { return Map.copyOf(ALL); }
    public static Endpoint find(String key) { return ALL.get(key); }
    private XiaobeiEndpoints() {}
}
