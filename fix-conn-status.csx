using System.Text.RegularExpressions;

var path = @"C:\Users\jwpmi\source\repos\DiskCleanUp\DiskCleanUp.Service\wwwroot\index.html";
var html = File.ReadAllText(path);

// Match the entire conn-tip-wrap span (from opening to its closing </span>)
var pattern = @"<span class=""conn-tip-wrap"">.*?</span>(?=\s*<span id=""totalSaved"")";
var replacement = @"  <a id=""connStatus"" class=""disconnected"" href=""/ws-diagram.html"" target=""_blank"" title=""Click to view WebSocket architecture diagram"" style=""text-decoration:none;cursor:pointer"">⚡ Connecting…</a>";

var updated = Regex.Replace(html, pattern, replacement, RegexOptions.Singleline);

if (updated == html) {
    Console.Error.WriteLine("ERROR: Pattern not matched — no changes made.");
    return 1;
}

File.WriteAllText(path, updated);
Console.WriteLine("Done.");
return 0;
